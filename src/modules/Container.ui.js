import React, { Component } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { connect } from 'react-redux'
import { Scene, Router } from 'react-native-router-flux'
import { Container, Content, StyleProvider } from 'native-base'
import getTheme from '../../native-base-theme/components'
import platform from '../../native-base-theme/variables/platform'

import SideMenu from './SideMenu/SideMenu.ui'
import Header from './Header/Header.ui'
import TabBar from './TabBar/TabBar.ui'
import Transactions from './Transactions/Transactions.ui'
import Directory from './Directory/Directory.ui'
import Request from './Request/index'
import SendConfirmation from './SendConfirmation/index'
import Scan from './Scan/Scan.ui'
import WalletList from './WalletList/WalletList.ui'

import { makeContext } from 'airbitz-core-js'
import { makeReactNativeIo } from 'react-native-airbitz-io'
import { addAccountToRedux, addAirbitzToRedux } from './Login/Login.action.js'

import AddWallet from './AddWallet/index.js'

const RouterWithRedux = connect()(Router)

class Main extends Component {
  constructor (props) {
    super(props)

    this.state = {}
  }

  componentDidMount () {
    makeReactNativeIo()
      .then(io => {
        const context = makeContext({
          apiKey: '0b5776a91bf409ac10a3fe5f3944bf50417209a0',
          io
        })
        this.props.dispatch(addAirbitzToRedux(context))

        return context.loginWithPassword('bob19', 'Funtimes19')
      })
      .then(account => {
        this.props.dispatch(addAccountToRedux(account))

        return account
      })
  }

  render () {
    return (
      <StyleProvider style={getTheme(platform)}>
        <Container>
          <SideMenu>
            <Header />
            <RouterWithRedux>
              <Scene key='root' hideNavBar>

                <Scene key='scan' component={Scan} title='Scan' duration={0} />

                <Scene key='walletList' component={WalletList} title='Wallets' duration={0} initial />
                
                <Scene key='directory' component={Directory} title='Directory' duration={0} />

                <Scene key='transactions' component={Transactions} title='Transactions' duration={0} initial />

                <Scene key='request' component={Request} title='Request' duration={0} />

                <Scene key='sendConfirmation' component={SendConfirmation} title='Send Confirmation' duration={0} />

                <Scene key='addWallet' component={AddWallet} title='Add Wallet' duration={0} />

              </Scene>
            </RouterWithRedux>
          </SideMenu>
          <TabBar />
        </Container>
      </StyleProvider>
    )
  }

}

export default connect()(Main)
